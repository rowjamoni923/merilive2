I will restore the professional **Agency Dashboard** with all the high-end features that were accidentally lost, including the 3D premium icons, real-time data sync (Zero Refresh), host management, payroll helper system, and sub-agent panels.

### Technical Details:
- **UI Restoration:** Rebuilding the dashboard layout with premium gradients and `AgencyDashboard` specific components.
- **3D Icons:** Re-integrating `HostsIcon3D`, `WithdrawIcon3D`, `RankingIcon3D`, etc.
- **Real-time Sync:** Ensuring `useUniversalRealtime` is correctly used to update balances and host counts instantly.
- **Full Feature Set:**
    - Host Management (Invite, List, Stats)
    - Agency Commission & Withdrawal
    - Sub-Agent recruitment and management
    - Payroll Helper integration and leveling
    - Diamond/Bean exchange history
    - Policy and Guidelines section

The current file is only ~196 lines, while a professional dashboard of this scale should be around 1,500-2,000 lines. I will rebuild it meticulously to match the professional standards of apps like ChaMet and Bigo.

---
**Restoration Plan for AgencyDashboard.tsx:**
1.  **Imports:** Restore all necessary UI components, icons, and hooks.
2.  **State Management:** Add states for multi-currency balances, host statistics, helper status, and real-time updates.
3.  **Real-time Subscriptions:** Implement `subscribeToTables` for `agencies`, `agency_hosts`, and `topup_helpers`.
4.  **Main Layout:** A scrollable, high-fidelity view with a sticky header and premium card designs.
5.  **Navigation & Modals:** Restore navigation to detailed sub-pages (Withdrawal, Transfer, History) and modals for Helper applications.
