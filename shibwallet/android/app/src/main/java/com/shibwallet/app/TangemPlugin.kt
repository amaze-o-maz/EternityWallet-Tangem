package com.shibwallet.app

import android.content.Context
import android.content.pm.PackageManager
import android.nfc.NfcAdapter

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

    /**
     * Lazily build the SDK against the host Activity. The Tangem SDK draws
     * its own NFC bottom-sheet on top of the current Activity, so we need
     * an Activity-bound instance.
     */
    private fun sdk(): TangemSdk {
        val existing = _sdk
        if (existing != null) return existing
        synchronized(sdkLock) {
            _sdk?.let { return it }
            val activity = activity as? ComponentActivity
                ?: throw IllegalStateException("Tangem requires a ComponentActivity host")
            val created = TangemSdk.init(activity)
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
        val sdk = try {
            sdk()
        } catch (e: Throwable) {
            call.reject("Tangem SDK not initialized: ${e.message}", "not_initialized")
            return
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

        val sdk = try {
            sdk()
        } catch (e: Throwable) {
            call.reject("Tangem SDK not initialized: ${e.message}", "not_initialized")
            return
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

        val sdk = try {
            sdk()
        } catch (e: Throwable) {
            call.reject("Tangem SDK not initialized: ${e.message}", "not_initialized")
            return
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
