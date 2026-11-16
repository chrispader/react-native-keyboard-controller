import { act, renderHook } from "@testing-library/react-native";
import React, { Suspense } from "react";

import { sv } from "../../../__fixtures__/sv";
import { useKeyboardAnimation, useTranslateAnimation } from "../hooks";

import type { KeyboardHandler, NativeEvent } from "../../../types";

type Handlers = Required<KeyboardHandler>;

const KEYBOARD = 300;

const mockContext = { height: sv(0), progress: sv(0) };
const mockHandlers = new Set<Handlers>();
// work that Reanimated would schedule on the UI thread
const mockUIQueue: Array<() => void> = [];
let mockIsOnUIThread = false;

/**
 * Runs a callback as if it was executed on the UI thread.
 *
 * @param callback - The callback to run.
 * @example onUIThread(() => handler.onEnd(event));
 */
function onUIThread(callback: () => void) {
  mockIsOnUIThread = true;
  callback();
  mockIsOnUIThread = false;
}

/**
 * Creates a shared value that mimics Reanimated's threading model: writes from
 * worklets are applied immediately, while writes from JS are scheduled on the
 * UI thread.
 *
 * @template T - Type of the stored value.
 * @param initial - Value stored before any write happens.
 * @returns An object with a `value` accessor.
 * @example const isClosed = mockSharedValue(true);
 */
function mockSharedValue<T>(initial: T) {
  let current = initial;

  return {
    get value() {
      return current;
    },
    set value(next: T) {
      if (mockIsOnUIThread) {
        current = next;
      } else {
        mockUIQueue.push(() => {
          current = next;
        });
      }
    },
  };
}

jest.mock("react-native-reanimated", () => {
  const { useState } = require("react");

  return {
    ...require("react-native-reanimated/mock"),
    useSharedValue: <T,>(initial: T) =>
      useState(() => mockSharedValue(initial))[0],
    runOnUI:
      (worklet: (...args: unknown[]) => void) =>
      (...args: unknown[]) => {
        mockUIQueue.push(() => worklet(...args));
      },
  };
});

jest.mock("../../../context", () => ({
  useKeyboardContext: () => ({ reanimated: mockContext }),
}));

jest.mock("../../../hooks", () => ({
  useKeyboardHandler: (handler: Handlers) => {
    const { useLayoutEffect } = require("react");

    // handlers receive events only while they are attached, like in the real hook
    useLayoutEffect(() => {
      mockHandlers.add(handler);

      return () => {
        mockHandlers.delete(handler);
      };
    });
  },
}));

/**
 * Runs callbacks queued by `runOnUI` and by shared value writes from JS.
 *
 * @example flushUIThread();
 */
function flushUIThread() {
  onUIThread(() => {
    mockUIQueue.splice(0).forEach((callback) => callback());
  });
}

/**
 * Dispatches a keyboard event to the registered handler on the UI thread.
 *
 * @param type - Name of the handler to invoke.
 * @param height - Keyboard height reported by the event.
 * @param progress - Keyboard progress reported by the event.
 * @example emit("onEnd", 300, 1);
 */
function emit(type: keyof Handlers, height: number, progress: number) {
  const event: NativeEvent = { height, progress, duration: 250, target: 1 };

  onUIThread(() => mockHandlers.forEach((handler) => handler[type](event)));
}

/**
 * Simulates a keyboard appearance: start, two frames and end.
 *
 * @example open();
 */
function open() {
  emit("onStart", KEYBOARD, 1);
  emit("onMove", KEYBOARD / 2, 0.5);
  emit("onMove", KEYBOARD, 1);
  emit("onEnd", KEYBOARD, 1);
}

beforeEach(() => {
  mockContext.height.value = 0;
  mockContext.progress.value = 0;
  mockHandlers.clear();
  isFrozen = false;
  mockUIQueue.length = 0;
});

describe("`useKeyboardAnimation` initial state", () => {
  it("should be taken from the context when the keyboard is already open", () => {
    mockContext.height.value = -KEYBOARD;
    mockContext.progress.value = 1;

    const { result } = renderHook(() => useKeyboardAnimation());

    flushUIThread();

    expect(result.current.heightWhenOpened.value).toBe(KEYBOARD);
    expect(result.current.height.value).toBe(KEYBOARD);
    expect(result.current.progress.value).toBe(1);
    expect(result.current.isClosed.value).toBe(false);
  });

  it("should not override keyboard events handled before it was applied", () => {
    const { result } = renderHook(() => useKeyboardAnimation());

    open();
    flushUIThread();

    expect(result.current.heightWhenOpened.value).toBe(KEYBOARD);
    expect(result.current.height.value).toBe(KEYBOARD);
    expect(result.current.progress.value).toBe(1);
    expect(result.current.isClosed.value).toBe(false);
  });

  it("should not override `onStart` handled before it was applied", () => {
    const { result } = renderHook(() => useKeyboardAnimation());

    emit("onStart", KEYBOARD, 1);
    flushUIThread();
    emit("onMove", KEYBOARD / 2, 0.5);
    emit("onMove", KEYBOARD, 1);
    emit("onEnd", KEYBOARD, 1);

    expect(result.current.heightWhenOpened.value).toBe(KEYBOARD);
    expect(result.current.isClosed.value).toBe(false);
  });

  it("should get keyboard height from `onEnd` if `onStart` was missed", () => {
    // keyboard started to open before the handler was attached
    mockContext.height.value = -KEYBOARD / 3;
    mockContext.progress.value = 1 / 3;

    const { result } = renderHook(() => useKeyboardAnimation());

    flushUIThread();
    emit("onMove", KEYBOARD, 1);
    emit("onEnd", KEYBOARD, 1);

    expect(result.current.heightWhenOpened.value).toBe(KEYBOARD);
    expect(result.current.isClosed.value).toBe(false);
  });
});

describe("`useTranslateAnimation` initial state", () => {
  it("should not override keyboard events handled before it was applied", () => {
    const { result } = renderHook(() => useTranslateAnimation());

    open();
    flushUIThread();

    expect(result.current.padding.value).toBe(1);
  });
});

const neverResolves = new Promise<never>(() => {});

/**
 * Suspends its children like `react-freeze` does, which detaches their layout
 * effects (and keyboard handlers) while keeping their state.
 *
 * @param props - Component props.
 * @param props.frozen - Whether the children should be frozen.
 * @param props.children - Children to freeze.
 * @returns The children while they are not frozen.
 * @example <Freezer frozen={true}><Screen /></Freezer>
 */
function Freezer({
  frozen,
  children,
}: {
  frozen: boolean;
  children: React.ReactNode;
}) {
  if (frozen) {
    throw neverResolves;
  }

  return <>{children}</>;
}

let isFrozen = false;

/**
 * Wraps a screen so it can be frozen, like `react-native-screens` does.
 *
 * @param props - Component props.
 * @param props.children - Screen to freeze.
 * @returns The screen wrapped in a `Suspense` boundary.
 * @example <FreezeWrapper><Screen /></FreezeWrapper>
 */
function FreezeWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Freezer frozen={isFrozen}>{children}</Freezer>
    </Suspense>
  );
}

/**
 * Updates the keyboard state of the context, which is always attached.
 *
 * @param height - Keyboard height.
 * @param progress - Keyboard progress.
 * @example setContext(300, 1);
 */
function setContext(height: number, progress: number) {
  mockContext.height.value = -height;
  mockContext.progress.value = progress;
}

/**
 * Renders both hooks in a screen that can be frozen.
 *
 * @returns Helpers to freeze, unfreeze and read the hooks results.
 * @example const screen = renderScreen();
 */
function renderScreen() {
  const { result, rerender } = renderHook(
    () => ({
      keyboard: useKeyboardAnimation(),
      translate: useTranslateAnimation(),
    }),
    { wrapper: FreezeWrapper },
  );
  const setFrozen = (frozen: boolean) => {
    isFrozen = frozen;
    act(() => rerender({}));
  };

  return {
    result,
    freeze: () => setFrozen(true),
    unfreeze: () => setFrozen(false),
  };
}

describe("state after handlers were re-attached", () => {
  it("should be synced when the keyboard was closed while handlers were detached", () => {
    const screen = renderScreen();

    flushUIThread();
    open();
    setContext(KEYBOARD, 1);

    screen.freeze();
    flushUIThread();
    expect(mockHandlers.size).toBe(0);

    // keyboard is closed on another screen
    setContext(0, 0);

    screen.unfreeze();
    flushUIThread();

    const { keyboard, translate } = screen.result.current;

    expect(keyboard.isClosed.value).toBe(true);
    expect(keyboard.height.value).toBe(0);
    expect(keyboard.progress.value).toBe(0);
    expect(translate.padding.value).toBe(0);
    expect(translate.translate.value).toBe(0);
  });

  it("should be synced when the keyboard was opened while handlers were detached", () => {
    const screen = renderScreen();

    flushUIThread();
    screen.freeze();
    flushUIThread();

    // keyboard is opened on another screen
    setContext(KEYBOARD, 1);

    screen.unfreeze();
    flushUIThread();

    const { keyboard, translate } = screen.result.current;

    expect(keyboard.isClosed.value).toBe(false);
    expect(keyboard.heightWhenOpened.value).toBe(KEYBOARD);
    expect(keyboard.height.value).toBe(KEYBOARD);
    expect(keyboard.progress.value).toBe(1);
    expect(translate.padding.value).toBe(1);
    expect(translate.translate.value).toBe(1);
  });

  it("should not override events that arrived after handlers were re-attached", () => {
    const screen = renderScreen();

    flushUIThread();
    screen.freeze();
    // detaching and attaching again before the UI thread runs queued work
    screen.unfreeze();

    // keyboard starts to open before the queued work runs; Android updates
    // the context only on `onMove`
    emit("onStart", KEYBOARD, 1);
    flushUIThread();

    const { keyboard } = screen.result.current;

    expect(keyboard.isClosed.value).toBe(false);
    expect(keyboard.heightWhenOpened.value).toBe(KEYBOARD);
  });
});
