import { useLayoutEffect } from "react";
import { Platform } from "react-native";
import { runOnUI, useSharedValue } from "react-native-reanimated";

import { useKeyboardContext } from "../../context";
import { useKeyboardHandler } from "../../hooks";

const OS = Platform.OS;

export const useKeyboardAnimation = () => {
  const { reanimated } = useKeyboardContext();

  const heightWhenOpened = useSharedValue(0);
  const height = useSharedValue(0);
  const progress = useSharedValue(0);
  const isClosed = useSharedValue(true);
  const eventCount = useSharedValue(0);

  // runs on mount and every time the handlers below are attached again (i. e. when
  // a frozen screen becomes visible), so it has to sync with the keyboard state that
  // may have changed while they were detached
  useLayoutEffect(() => {
    // reading from JS is synchronous, so it counts every event handled so far
    const eventCountBeforeAttach = eventCount.value;

    // writes from JS are applied on the UI thread asynchronously, so they may
    // overwrite values set by keyboard events that arrived in between (i. e. when
    // input has `autoFocus`) - sync only if no event arrived since the handlers
    // were attached
    runOnUI(() => {
      "worklet";

      if (eventCount.value !== eventCountBeforeAttach) {
        return;
      }

      const initialHeight = -reanimated.height.value;
      const initialProgress = reanimated.progress.value;

      // eslint-disable-next-line react-compiler/react-compiler
      heightWhenOpened.value = initialHeight;
      height.value = initialHeight;
      progress.value = initialProgress;
      isClosed.value = initialProgress === 0;
    })();
  }, []);

  useKeyboardHandler(
    {
      onStart: (e) => {
        "worklet";

        eventCount.value += 1;

        if (e.height > 0) {
          isClosed.value = false;
          heightWhenOpened.value = e.height;
        }
      },
      onMove: (e) => {
        "worklet";

        eventCount.value += 1;
        progress.value = e.progress;
        height.value = e.height;
      },
      onInteractive: (e) => {
        "worklet";

        eventCount.value += 1;
        progress.value = e.progress;
        height.value = e.height;
      },
      onEnd: (e) => {
        "worklet";

        eventCount.value += 1;
        isClosed.value = e.height === 0;

        // `onStart` may have been dispatched before this handler was attached
        if (e.height > 0 && e.progress === 1) {
          heightWhenOpened.value = e.height;
        }

        height.value = e.height;
        progress.value = e.progress;
      },
    },
    [],
  );

  return { height, progress, heightWhenOpened, isClosed };
};
export const useTranslateAnimation = () => {
  const { reanimated } = useKeyboardContext();

  const padding = useSharedValue(0);
  const translate = useSharedValue(0);
  const eventCount = useSharedValue(0);

  // see `useKeyboardAnimation` for an explanation
  useLayoutEffect(() => {
    const eventCountBeforeAttach = eventCount.value;

    runOnUI(() => {
      "worklet";

      if (eventCount.value !== eventCountBeforeAttach) {
        return;
      }

      // eslint-disable-next-line react-compiler/react-compiler
      padding.value = reanimated.progress.value;
      translate.value = reanimated.progress.value;
    })();
  }, []);

  useKeyboardHandler(
    {
      onStart: (e) => {
        "worklet";

        eventCount.value += 1;

        if (e.height === 0) {
          padding.value = 0;
        }
        if (OS === "ios") {
          translate.value = e.progress;
        }
      },
      onMove: (e) => {
        "worklet";

        eventCount.value += 1;

        if (OS !== "ios") {
          translate.value = e.progress;
        }
      },
      onInteractive: (e) => {
        "worklet";

        eventCount.value += 1;
        padding.value = 0;

        translate.value = e.progress;
      },
      onEnd: (e) => {
        "worklet";

        eventCount.value += 1;
        padding.value = e.progress;

        if (OS !== "ios") {
          translate.value = e.progress;
        }
      },
    },
    [],
  );

  return { translate, padding };
};
