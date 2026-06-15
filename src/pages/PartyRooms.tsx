import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Deprecated route — redirects to home. The intermediate render previously
// returned `null` which produced a white flash during back-nav from a party
// room. Render the same deep-purple party backdrop instead so the transition
// looks like a normal in-place UI change (matches Chamet/Bigo behavior).
const PartyRooms = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <div
      className="fixed inset-0 z-0"
      aria-hidden
      style={{
        background:
          'radial-gradient(ellipse at top, hsl(270 60% 22%) 0%, hsl(265 55% 14%) 45%, hsl(260 50% 8%) 100%)',
      }}
    />
  );
};

export default PartyRooms;
