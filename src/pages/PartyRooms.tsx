import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// This page is deprecated - redirects to home page
const PartyRooms = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  return null;
};

export default PartyRooms;
