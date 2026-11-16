import { act, render } from "@testing-library/react-native";
import React from "react";
import { Animated, View } from "react-native";

import { KeyboardProvider } from "../animated";
import { KeyboardContext } from "../context";
import { useAnimatedKeyboardHandler } from "../reanimated";

import type { KeyboardAnimationContext } from "../context";
import type { NativeEvent } from "../types";
import type * as ReactNative from "react-native";

jest.mock("../bindings", () => ({
  KeyboardControllerView:
    jest.requireActual<typeof ReactNative>("react-native").View,
}));
jest.mock("../module", () => ({ KeyboardController: {} }));
jest.mock("../reanimated", () => ({
  useAnimatedKeyboardHandler: jest.fn(),
  useFocusedInputLayoutHandler: jest.fn(),
}));

const animatedEvent = Animated.event;
const mockedKeyboardHandler = jest.mocked(useAnimatedKeyboardHandler);

beforeEach(() => {
  mockedKeyboardHandler.mockClear();
  // Exercise Animated values in Jest, where the native animation driver is absent.
  jest
    .spyOn(Animated, "event")
    .mockImplementation((mapping) =>
      animatedEvent(mapping, { useNativeDriver: false }),
    );
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("KeyboardProvider on iOS", () => {
  it.each([0, 328])(
    "should settle both animation contexts at %s after a late interactive frame",
    (finalHeight) => {
      const contexts: KeyboardAnimationContext[] = [];
      const view = render(
        <KeyboardProvider preload={false}>
          <KeyboardContext.Consumer>
            {(context) => {
              contexts.push(context);

              return null;
            }}
          </KeyboardContext.Consumer>
        </KeyboardProvider>,
      );
      const context = contexts[0];
      const handlers = mockedKeyboardHandler.mock.calls[0][0];
      const nativeHandlers = view.UNSAFE_getAllByType(View)[0].props as Record<
        keyof typeof handlers,
        ((event: { nativeEvent: NativeEvent }) => void) | undefined
      >;
      const dispatch = (name: keyof typeof handlers, height: number) => {
        const event = {
          height,
          progress: height / 328,
          duration: 250,
          target: 1,
        };

        act(() => {
          handlers[name]?.({ ...event, eventName: name }, {});
          nativeHandlers[name]?.({ nativeEvent: event });
        });
      };

      dispatch("onKeyboardMoveStart", 328);
      dispatch("onKeyboardMoveInteractive", 233);
      dispatch("onKeyboardMoveStart", finalHeight);
      dispatch("onKeyboardMoveInteractive", 73);

      expect(context.reanimated.height.value).toBe(-73);

      dispatch("onKeyboardMoveEnd", finalHeight);

      expect(context.reanimated.height.value).toBe(-finalHeight);
      expect(context.reanimated.progress.value).toBe(finalHeight / 328);
      expect(JSON.parse(JSON.stringify(context.animated.height))).toBeCloseTo(
        -finalHeight,
      );
      expect(JSON.parse(JSON.stringify(context.animated.progress))).toBe(
        finalHeight / 328,
      );
    },
  );
});
