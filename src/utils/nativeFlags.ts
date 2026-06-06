import { NativeFlags } from './nativeFlags';

export interface NativeFlags {
  imageNative: boolean;
  reelsNative: boolean;
  chatUINative: boolean;
  socketNative: boolean;
  feedNative: boolean;
  routerShellNative: boolean;
  videoPrecache: boolean;
  pipCall: boolean;
  giftPanelNative: boolean;
}

export const getNativeFlags = (): NativeFlags => {
  return {
    imageNative: localStorage.getItem('image:native') === 'on',
    reelsNative: localStorage.getItem('reels:native') === 'on',
    chatUINative: localStorage.getItem('chatui:native') === 'on',
    socketNative: localStorage.getItem('socket:native') === 'on',
    feedNative: localStorage.getItem('feed:native') === 'on',
    routerShellNative: localStorage.getItem('routerShell:native') === 'on',
    videoPrecache: localStorage.getItem('video:precache') === 'on',
    pipCall: localStorage.getItem('pip:call') === 'on',
    giftPanelNative: localStorage.getItem('gift:native') === 'on',
  };
};
