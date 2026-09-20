import { useState } from 'react';
export function useAndroidBackButton(_?: any) {
  const [showExitDialog, setShowExitDialog] = useState(false);
  return {
    showExitDialog,
    handleExitApp: () => setShowExitDialog(false),
    handleCancelExit: () => setShowExitDialog(false),
  };
}
