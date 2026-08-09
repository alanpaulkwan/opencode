import { describe, expect, test } from "bun:test"
import { ATTACHMENT_PREVIEW_LIMITS, parseNotebookDataUrl, parsePdfDataUrl } from "./attachment-preview-parse"

const dataUrl = (mime: string, text: string) => `data:${mime};base64,${btoa(text)}`

describe("attachment previews", () => {
  test("accepts bounded PDF data URLs with PDF magic bytes", () => {
    expect(parsePdfDataUrl(dataUrl("application/pdf", "%PDF-1.7\n"))?.slice(0, 4)).toEqual(new Uint8Array([37, 80, 68, 70]))
  })

  test("rejects non-PDF data URLs and spoofed PDF payloads", () => {
    expect(parsePdfDataUrl(dataUrl("text/plain", "%PDF-1.7\n"))).toBeUndefined()
    expect(parsePdfDataUrl(dataUrl("application/pdf", "not a pdf"))).toBeUndefined()
    expect(parsePdfDataUrl("https://example.com/file.pdf")).toBeUndefined()
  })

  test("rejects oversized PDF data URLs", () => {
    expect(parsePdfDataUrl(dataUrl("application/pdf", `%PDF${"x".repeat(ATTACHMENT_PREVIEW_LIMITS.dataUrlEncodedBytes)}`))).toBeUndefined()
  })

  test("parses notebook markdown, code, and safe text outputs", () => {
    const notebook = parseNotebookDataUrl({
      filename: "work.ipynb",
      url: dataUrl(
        "application/json",
        JSON.stringify({
          cells: [
            { cell_type: "markdown", source: ["# Title"] },
            {
              cell_type: "code",
              source: "print('x')",
              outputs: [
                { output_type: "stream", text: "hello" },
                { output_type: "execute_result", data: { "text/plain": "42", "text/html": "<b>42</b>" } },
              ],
            },
          ],
        }),
      ),
    })

    expect(notebook?.cells).toEqual([
      { kind: "markdown", source: "# Title" },
      { kind: "code", source: "print('x')", outputs: ["hello", "42"] },
    ])
  })

  test("rejects notebooks without an ipynb MIME or filename and invalid JSON", () => {
    expect(parseNotebookDataUrl({ url: dataUrl("application/json", "{}") })).toBeUndefined()
    expect(parseNotebookDataUrl({ filename: "work.ipynb", url: dataUrl("application/json", "not json") })).toBeUndefined()
  })

  test("rejects oversized notebook data URLs", () => {
    expect(
      parseNotebookDataUrl({
        filename: "work.ipynb",
        url: dataUrl("application/json", "x".repeat(ATTACHMENT_PREVIEW_LIMITS.notebookEncodedBytes)),
      }),
    ).toBeUndefined()
  })
})
