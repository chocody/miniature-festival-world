import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OWNERSHIP_LOSS_WARNING, OwnershipNotice } from "./OwnershipNotice";

afterEach(cleanup);

describe("OwnershipNotice", () => {
  it("renders the spec warning as a note", () => {
    render(<OwnershipNotice />);
    expect(screen.getByRole("note").textContent).toBe(OWNERSHIP_LOSS_WARNING);
  });

  it("copy is the spec sentence", () => {
    expect(OWNERSHIP_LOSS_WARNING).toBe(
      "การล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนอุปกรณ์จะทำให้ไม่สามารถค้นคืนรายการผลงานของตัวเองได้",
    );
  });

  it("contains no button or link", () => {
    render(<OwnershipNotice />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
