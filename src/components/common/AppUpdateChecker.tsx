import { forwardRef } from 'react';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import AppUpdateModal from './AppUpdateModal';

const AppUpdateChecker = forwardRef<HTMLDivElement>((_, ref) => {
  const {
    updateInfo,
    showUpdateModal,
    performImmediateUpdate,
    openPlayStore,
    dismissUpdate,
  } = useAppUpdate();

  if (!updateInfo?.updateAvailable) return null;

  return (
    <div ref={ref}>
      <AppUpdateModal
        isOpen={showUpdateModal}
        currentVersion={updateInfo.currentVersion}
        availableVersion={updateInfo.availableVersion}
        forceUpdate={updateInfo.forceUpdate}
        updateMessage={updateInfo.updateMessage}
        onUpdate={performImmediateUpdate}
        onOpenStore={openPlayStore}
        onDismiss={dismissUpdate}
      />
    </div>
  );
});

AppUpdateChecker.displayName = 'AppUpdateChecker';

export default AppUpdateChecker;

