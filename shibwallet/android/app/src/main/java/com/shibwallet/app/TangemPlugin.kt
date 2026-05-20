package com.shibwallet.app

import android.content.Context
import android.content.pm.PackageManager
import android.nfc.NfcAdapter
import android.os.Handler
import android.os.Looper

import androidx.activity.ComponentActivity

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

import com.tangem.TangemSdk
import com.tangem.common.CompletionResult
import com.tangem.common.card.EllipticCurve
import com.tangem.common.core.TangemError
import com.tangem.common.core.TangemSdkError
import com.tangem.operations.sign.SignResponse
import com.tangem.operations.wallet.CreateWalletResponse
import com.tangem.sdk.extensions.init

import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicReference

/**
 * Capacitor bridge for the Tangem SDK. This is intentionally a thin
 * transport layer — all Ethereum-specific logic (transaction serialization,
 * hashing, recovery-byte calculation, address derivation) lives on the
 * TypeScript side in src/lib/tangem.ts and src/lib/signers.ts.
 *
 * Methods exposed to JS:
 *   - nfcAvailable()                              -> { hasNfc, enabled }
 *   - scanCard({ message? })                      -> { cardId, wallets[] }
 *   - createWallet({ cardId, curve? })            -> { cardId, publicKey, curve }
 *   - sign({ cardId, walletPublicKey, hashes[],
 *           message? })                           -> { cardId, signatures[] }
 *
 * Errors are surfaced as Capacitor errors whose `code` field matches the
 * string constants in src/lib/tangem.ts (TangemErrorCode). The JS wrapper
 * translates them into a typed TangemError.
 */
@CapacitorPlugin(name = "Tangem")
class TangemPlugin : Plugin() {

    private val sdkLock = Any()
    private var _sdk: TangemSdk? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    /**
     * Eagerly initialize the Tangem SDK on the main thread. `load()` is
     * invoked by the Capacitor bridge during plugin registration, which
     * happens on the UI thread — perfect for the SDK's internal
     * LifecycleObserver registration (which contractually must run on
     * the main thread; calling it from a background thread throws
     * "method addObserver must be called on the main thread").
     */
    override fun load() {
        super.load()
        val activity = activity as? ComponentActivity ?: return
        try {
            _sdk = TangemSdk.init(activity)
        } catch (e: Throwable) {
            // Fall back to lazy init in sdk() — we'll retry on the first call.
            _sdk = null
        }
    }

    /**
     * Returns the SDK instance, initializing it on the main thread if
     * load() didn't manage to (e.g. activity wasn't a ComponentActivity
     * at registration time, or init threw). Plugin methods run on a
     * background thread, so we dispatch initialization to the main
     * thread and block until it completes.
     */
    private fun sdk(): TangemSdk {
        val existing = _sdk
        if (existing != null) return existing
        synchronized(sdkLock) {
            _sdk?.let { return it }
            val activity = activity as? ComponentActivity
                ?: throw IllegalStateException("Tangem requires a ComponentActivity host")
            if (Looper.myLooper() == Looper.getMainLooper()) {
                val created = TangemSdk.init(activity)
                _sdk = created
                return created
            }
            val ref = AtomicReference<Any>()
            val latch = CountDownLatch(1)
            mainHandler.post {
                try {
                    ref.set(TangemSdk.init(activity))
                } catch (e: Throwable) {
                    ref.set(e)
                } finally {
                    latch.countDown()
                }
            }
            latch.await()
            val result = ref.get()
            if (result is Throwable) throw result
            val created = result as TangemSdk
            _sdk = created
            return created
        }
    }

    private fun bytesToHex(bytes: ByteArray): String {
        val sb = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            sb.append(String.format("%02x", b.toInt() and 0xff))
        }
        return sb.toString()
    }

    private fun hexToBytes(hex: String): ByteArray {
        val clean = if (hex.startsWith("0x") || hex.startsWith("0X")) hex.substring(2) else hex
        require(clean.length % 2 == 0) { "Invalid hex string" }
        val out = ByteArray(clean.length / 2)
        for (i in out.indices) {
            out[i] = clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
        return out
    }

    /** Map Tangem SDK errors onto the stable string codes the JS side knows. */
    private fun errorCodeFor(error: TangemError): String = when (error) {
        is TangemSdkError.UserCancelled -> "user_cancelled"
        is TangemSdkError.NfcFeatureIsUnavailable -> "nfc_unavailable"
        is TangemSdkError.WrongCardNumber -> "wrong_card"
        is TangemSdkError.WrongCardType -> "wrong_card"
        is TangemSdkError.TagLost -> "tag_lost"
        else -> "unknown"
    }

    private fun rejectWithError(call: PluginCall, error: TangemError) {
        val code = errorCodeFor(error)
        val message = error.customMessage.ifEmpty { error.javaClass.simpleName }
        // Pass `code` to Capacitor so it surfaces as err.code on the JS side.
        // We also attach the raw Tangem error code as data for debugging.
        val extra = JSObject().apply { put("tangemCode", error.code) }
        call.reject(message, code, null, extra)
    }

    @PluginMethod
    fun nfcAvailable(call: PluginCall) {
        val context: Context = context
        val adapter = NfcAdapter.getDefaultAdapter(context)
        val hasNfc = context.packageManager.hasSystemFeature(PackageManager.FEATURE_NFC)
        val enabled = adapter?.isEnabled == true
        val result = JSObject().apply {
            put("hasNfc", hasNfc)
            put("enabled", enabled)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun scanCard(call: PluginCall) {
        // SDK shows an NFC bottom sheet — must launch from main thread.
        mainHandler.post {
            val sdk = try {
                sdk()
            } catch (e: Throwable) {
                call.reject("Tangem SDK not initialized: ${e.message}", "not_initialized")
                return@post
            }
            sdk.scanCard(initialMessage = null) { result ->
                when (result) {
                    is CompletionResult.Success -> {
                        val card = result.data
                        val wallets = JSArray()
                        for (w in card.wallets) {
                            val obj = JSObject().apply {
                                put("publicKey", bytesToHex(w.publicKey))
                                put("curve", w.curve.curve)
                                put("index", w.index)
                            }
                            wallets.put(obj)
                        }
                        val response = JSObject().apply {
                            put("cardId", card.cardId)
                            put("wallets", wallets)
                        }
                        call.resolve(response)
                    }
                    is CompletionResult.Failure -> rejectWithError(call, result.error)
                }
            }
        }
    }

    @PluginMethod
    fun createWallet(call: PluginCall) {
        val cardId = call.getString("cardId")
        if (cardId.isNullOrEmpty()) {
            call.reject("cardId is required", "invalid_argument")
            return
        }
        val curveName = call.getString("curve", "secp256k1") ?: "secp256k1"
        val curve = EllipticCurve.values().firstOrNull {
            it.curve.equals(curveName, ignoreCase = true)
        } ?: EllipticCurve.Secp256k1

        mainHandler.post {
            val sdk = try {
                sdk()
            } catch (e: Throwable) {
                call.reject("Tangem SDK not initialized: ${e.message}", "not_initialized")
                return@post
            }
            sdk.createWallet(curve = curve, cardId = cardId, initialMessage = null) { result ->
                when (result) {
                    is CompletionResult.Success -> {
                        val data: CreateWalletResponse = result.data
                        val response = JSObject().apply {
                            put("cardId", data.cardId)
                            put("publicKey", bytesToHex(data.wallet.publicKey))
                            put("curve", data.wallet.curve.curve)
                        }
                        call.resolve(response)
                    }
                    is CompletionResult.Failure -> rejectWithError(call, result.error)
                }
            }
        }
    }

    @PluginMethod
    fun sign(call: PluginCall) {
        val cardId = call.getString("cardId")
        if (cardId.isNullOrEmpty()) {
            call.reject("cardId is required", "invalid_argument")
            return
        }
        val walletPubkeyHex = call.getString("walletPublicKey")
        if (walletPubkeyHex.isNullOrEmpty()) {
            call.reject("walletPublicKey is required", "invalid_argument")
            return
        }
        val hashesJs = call.getArray("hashes")
        if (hashesJs == null || hashesJs.length() == 0) {
            call.reject("hashes is required and must be non-empty", "invalid_argument")
            return
        }

        val hashes = try {
            Array(hashesJs.length()) { i ->
                val raw = hashesJs.getString(i)
                    ?: throw IllegalArgumentException("hashes[$i] is not a string")
                val bytes = hexToBytes(raw)
                if (bytes.size != 32) {
                    throw IllegalArgumentException("hashes[$i] must be 32 bytes (got ${bytes.size})")
                }
                bytes
            }
        } catch (e: Throwable) {
            call.reject(e.message ?: "Invalid hashes payload", "invalid_argument")
            return
        }

        // Trim the wallet pubkey to 65 bytes max (some firmware include a 04 prefix; the
        // SDK accepts whichever raw form the card stored, but we trust the original card
        // bytes — JS already normalizes to 65-byte uncompressed when comparing).
        val walletPublicKey = try {
            hexToBytes(walletPubkeyHex)
        } catch (e: Throwable) {
            call.reject("Invalid walletPublicKey hex", "invalid_argument")
            return
        }

        mainHandler.post {
            val sdk = try {
                sdk()
            } catch (e: Throwable) {
                call.reject("Tangem SDK not initialized: ${e.message}", "not_initialized")
                return@post
            }

            sdk.sign(
                hashes = hashes,
                walletPublicKey = walletPublicKey,
                cardId = cardId,
                derivationPath = null,
                initialMessage = null,
            ) { result ->
                when (result) {
                    is CompletionResult.Success -> {
                        val data: SignResponse = result.data
                        val sigs = JSArray()
                        for (sig in data.signatures) {
                            sigs.put(bytesToHex(sig))
                        }
                        val response = JSObject().apply {
                            put("cardId", data.cardId)
                            put("signatures", sigs)
                        }
                        call.resolve(response)
                    }
                    is CompletionResult.Failure -> rejectWithError(call, result.error)
                }
            }
        }
    }
}
