import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NO_WEBGL_COPY } from "@/config/noWebgl.config";
import { NoWebglNotice } from "./NoWebglNotice";

afterEach(cleanup);

describe("NoWebglNotice (MFW-71)", () => {
  it("N1: the title as the heading, the help line, the test id, and no control", () => {
    render(<NoWebglNotice />);
    expect(screen.getByRole("heading", { level: 1, name: NO_WEBGL_COPY.title })).toBeInTheDocument();
    expect(screen.getByText(NO_WEBGL_COPY.help)).toBeInTheDocument();
    expect(screen.getByTestId("no-webgl-notice")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps the word การแสดงผล on one line (no mid-word break at 390 px)", () => {
    render(<NoWebglNotice />);
    const word = screen.getByRole("heading", { level: 1 }).querySelector("span");
    expect(word).toHaveTextContent("การแสดงผล");
    expect(word).toHaveClass("whitespace-nowrap");
  });
});
