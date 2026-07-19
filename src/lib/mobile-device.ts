interface MobileNavigatorSignals {
  maxTouchPoints: number;
  platform: string;
  userAgent: string;
  userAgentData?: {
    mobile: boolean;
  };
}

const MOBILE_USER_AGENT_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobi/i;

export function isMobileDevice(browserNavigator: MobileNavigatorSignals = window.navigator) {
  const clientHint = browserNavigator.userAgentData?.mobile;
  if (typeof clientHint === "boolean") {
    return clientHint;
  }

  return (
    MOBILE_USER_AGENT_PATTERN.test(browserNavigator.userAgent) ||
    (browserNavigator.platform === "MacIntel" && browserNavigator.maxTouchPoints > 1)
  );
}
