import { gamepadStore } from '../../gamepad/GamepadManager';
import {
  cameraStore,
  feedsStore,
  layersStore,
  selectionStore,
  statusStore,
  uiStore,
} from './appState';
import { useStore } from './store';

type State<S> = S extends { get(): infer T } ? T : never;

export const useLayers = <T>(select: (s: State<typeof layersStore>) => T) =>
  useStore(layersStore, select);
export const useFeeds = <T>(select: (s: State<typeof feedsStore>) => T) =>
  useStore(feedsStore, select);
export const useCamera = <T>(select: (s: State<typeof cameraStore>) => T) =>
  useStore(cameraStore, select);
export const useStatus = <T>(select: (s: State<typeof statusStore>) => T) =>
  useStore(statusStore, select);
export const useSelection = <T>(select: (s: State<typeof selectionStore>) => T) =>
  useStore(selectionStore, select);
export const useUi = <T>(select: (s: State<typeof uiStore>) => T) => useStore(uiStore, select);
export const useGamepad = <T>(select: (s: State<typeof gamepadStore>) => T) =>
  useStore(gamepadStore, select);

export { cameraStore, feedsStore, gamepadStore, layersStore, selectionStore, statusStore, uiStore };
