import { Capacitor, registerPlugin } from '@capacitor/core';

interface DAppBrowserPlugin {
  open(options: {
    url: string;
    address: string;
    privateKey: string;
    chainId: number;
    rpcUrl: string;
  }): Promise<{ success: boolean }>;
}

const NativeDAppBrowser = registerPlugin<DAppBrowserPlugin>('DAppBrowser');

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export async function openNativeDAppBrowser(options: {
  url: string;
  address: string;
  privateKey: string;
  chainId: number;
  rpcUrl: string;
}): Promise<void> {
  await NativeDAppBrowser.open(options);
}
