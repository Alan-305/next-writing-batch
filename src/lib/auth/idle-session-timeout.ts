/** 無操作のままこの時間を超えると強制ログアウトする（1時間） */
export const IDLE_SESSION_TIMEOUT_MS = 60 * 60 * 1000;

export const IDLE_LOGOUT_REASON_KEY = "nwb_idle_logout";

export const IDLE_LOGOUT_MESSAGE =
  "1時間以上操作がなかったため、安全のためログアウトしました。再度ログインしてください。";

/** ユーザー操作としてタイマーをリセットするイベント */
export const IDLE_ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "click"] as const;
