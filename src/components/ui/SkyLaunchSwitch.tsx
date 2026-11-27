"use client";

import type { JSX } from "react";
import { SKY_LAUNCH_SWITCH_COPY, type SkyLaunchKind } from "@/config/gimmicks.config";
import { getSkyLaunchPreference } from "@/services/preferences/skyLaunchPreference";
import { useDeviceStore } from "@/store/useDeviceStore";
import { HUD_BUTTON_CLASSES } from "./DayNightSwitch";
import { FireworkIcon, SkyLanternIcon } from "./hudIcons";

/**
 * Sky launch switch (MFW-85, backlog 15.3): one round HUD button, no text. Its icon shows what a tap on empty ground launches now (a
 * firework or a sky lantern); a tap on the button switches to the other kind. The choice stays on this device (DRAFT, docs/follow-ups.md).
 */
export function SkyLaunchSwitch(): JSX.Element {
  const choice = useDeviceStore((s) => s.skyLaunchChoice);

  const onClick = () => {
    const next: SkyLaunchKind = choice === "firework" ? "skyLantern" : "firework";
    getSkyLaunchPreference().write(next); // false (no storage) still keeps the choice for this session
    useDeviceStore.getState().setSkyLaunchChoice(next);
  };

  return (
    <button
      type="button"
      data-testid="sky-launch-switch"
      data-sky-launch={choice}
      aria-label={SKY_LAUNCH_SWITCH_COPY[choice]}
      className={HUD_BUTTON_CLASSES}
      onClick={onClick}
    >
      {choice === "firework" ? <FireworkIcon /> : <SkyLanternIcon />}
    </button>
  );
}
