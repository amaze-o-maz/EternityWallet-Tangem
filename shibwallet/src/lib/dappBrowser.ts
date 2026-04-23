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

let _browserOpen = false;

export function markBrowserOpen() {
  _browserOpen = true;
}

export function consumeBrowserOpen(): boolean {
  if (_browserOpen) {
    _browserOpen = false;
    return true;
  }
  return false;
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
