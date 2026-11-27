import { CUSTOMIZER_COPY } from "@/config/customizer.config";
import { SCENE_TAP_HINT_COPY } from "@/config/gimmicks.config";
import { INSPECT_POPUP_COPY } from "@/config/inspect.config";
import { MY_CREATIONS_COPY } from "@/config/myCreations.config";
import { OWNER_SWITCH_COPY, OWNER_WISH_COPY } from "@/config/ownerWish.config";
import { RITUAL_COPY } from "@/config/ritual.config";
import { FLOW_STEP_COPY } from "@/config/ui.config";
import { WISH_COPY } from "@/config/wish.config";
import { ZONE_NAV_COPY } from "@/config/zoneNav.config";
import type { EventCopy } from "./eventCopy.config";

/** Loy Krathong copy: references only, so it stays byte-identical to the existing constants (MFW-91). */
export const LOY_KRATHONG_COPY: EventCopy = Object.freeze({
  flowSteps: FLOW_STEP_COPY,
  customizer: Object.freeze({
    panelLabel: CUSTOMIZER_COPY.panelLabel,
    designGroupLabel: CUSTOMIZER_COPY.designGroupLabel,
    viewGroupLabel: CUSTOMIZER_COPY.viewGroupLabel,
    rotateLeft: CUSTOMIZER_COPY.rotateLeft,
    rotateRight: CUSTOMIZER_COPY.rotateRight,
    zoomIn: CUSTOMIZER_COPY.zoomIn,
    zoomOut: CUSTOMIZER_COPY.zoomOut,
    done: CUSTOMIZER_COPY.done,
    gestureHint: CUSTOMIZER_COPY.gestureHint,
  }),
  ritual: RITUAL_COPY,
  wish: WISH_COPY,
  inspect: Object.freeze({
    dialogTitle: INSPECT_POPUP_COPY.dialogTitle,
    wishHeading: INSPECT_POPUP_COPY.wishHeading,
    fromLabel: INSPECT_POPUP_COPY.fromLabel,
    close: INSPECT_POPUP_COPY.close,
  }),
  myCreations: MY_CREATIONS_COPY,
  ownerWish: OWNER_WISH_COPY,
  ownerSwitch: OWNER_SWITCH_COPY,
  sceneTapHint: SCENE_TAP_HINT_COPY.scene3d,
  zoneNav: Object.freeze({ ...ZONE_NAV_COPY, vertical: null }),
  findMyIcon: "krathong",
});
