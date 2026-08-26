import { describe, expect, test } from "bun:test"
import { padInsertedText, recorderFilename, recorderMime } from "./voice-recorder"

describe("voice recorder helpers", () => {
  test("pads inserted speech so it does not glue onto the previous word", () => {
    expect(padInsertedText("", "hello")).toBe("hello")
    expect(padInsertedText("Fix the ", "bug")).toBe("bug")
    expect(padInsertedText("Fix the", "bug")).toBe(" bug")
  })

  test("picks a webm filename unless the recorder is mp4", () => {
    expect(recorderFilename("audio/webm;codecs=opus")).toBe("recording.webm")
    expect(recorderFilename("audio/mp4")).toBe("recording.m4a")
    expect(recorderMime()).toBe("")
  })
})
