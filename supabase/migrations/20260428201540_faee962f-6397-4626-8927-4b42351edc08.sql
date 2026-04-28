
-- =========================================
-- COMPREHENSIVE RLS GAP FIX (Pkg22)
-- Fixes: party_room_messages, private_calls, seat_invitations,
--        seat_requests, helper_withdrawal_requests
-- All call/party/withdrawal flows: user-side CRUD restored.
-- =========================================

-- ---------- party_room_messages: missing SELECT ----------
DROP POLICY IF EXISTS "Participants can view party room messages" ON public.party_room_messages;
CREATE POLICY "Participants can view party room messages"
ON public.party_room_messages FOR SELECT TO authenticated
USING (
  is_deleted = false AND (
    EXISTS (
      SELECT 1 FROM public.party_room_participants p
      WHERE p.room_id = party_room_messages.room_id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.party_rooms r
      WHERE r.id = party_room_messages.room_id
        AND r.host_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Users can soft-delete their own party messages" ON public.party_room_messages;
CREATE POLICY "Users can soft-delete their own party messages"
ON public.party_room_messages FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ---------- private_calls: caller can create, both parties can view/update ----------
DROP POLICY IF EXISTS "Caller can create private call" ON public.private_calls;
CREATE POLICY "Caller can create private call"
ON public.private_calls FOR INSERT TO authenticated
WITH CHECK (auth.uid() = caller_id);

DROP POLICY IF EXISTS "Call participants can view their private calls" ON public.private_calls;
CREATE POLICY "Call participants can view their private calls"
ON public.private_calls FOR SELECT TO authenticated
USING (auth.uid() = caller_id OR auth.uid() = host_id);

DROP POLICY IF EXISTS "Call participants can update their private calls" ON public.private_calls;
CREATE POLICY "Call participants can update their private calls"
ON public.private_calls FOR UPDATE TO authenticated
USING (auth.uid() = caller_id OR auth.uid() = host_id)
WITH CHECK (auth.uid() = caller_id OR auth.uid() = host_id);

-- ---------- seat_invitations: invitee+inviter can view, invitee can respond ----------
DROP POLICY IF EXISTS "Invited users and inviters can view seat invitations" ON public.seat_invitations;
CREATE POLICY "Invited users and inviters can view seat invitations"
ON public.seat_invitations FOR SELECT TO authenticated
USING (auth.uid() = invitee_id OR auth.uid() = inviter_id);

DROP POLICY IF EXISTS "Invitee can respond to seat invitation" ON public.seat_invitations;
CREATE POLICY "Invitee can respond to seat invitation"
ON public.seat_invitations FOR UPDATE TO authenticated
USING (auth.uid() = invitee_id)
WITH CHECK (auth.uid() = invitee_id);

-- ---------- seat_requests: requester + room host can view, host can respond ----------
DROP POLICY IF EXISTS "Requester and host can view seat requests" ON public.seat_requests;
CREATE POLICY "Requester and host can view seat requests"
ON public.seat_requests FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.party_rooms r
    WHERE r.id = seat_requests.room_id AND r.host_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Room host can respond to seat requests" ON public.seat_requests;
CREATE POLICY "Room host can respond to seat requests"
ON public.seat_requests FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.party_rooms r
    WHERE r.id = seat_requests.room_id AND r.host_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.party_rooms r
    WHERE r.id = seat_requests.room_id AND r.host_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Requester can cancel own seat request" ON public.seat_requests;
CREATE POLICY "Requester can cancel own seat request"
ON public.seat_requests FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ---------- helper_withdrawal_requests: helper can create + view their own ----------
DROP POLICY IF EXISTS "Helpers can create their own withdrawal request" ON public.helper_withdrawal_requests;
CREATE POLICY "Helpers can create their own withdrawal request"
ON public.helper_withdrawal_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = helper_id);

DROP POLICY IF EXISTS "Helpers can view their own withdrawal requests" ON public.helper_withdrawal_requests;
CREATE POLICY "Helpers can view their own withdrawal requests"
ON public.helper_withdrawal_requests FOR SELECT TO authenticated
USING (auth.uid() = helper_id);

-- =========================================
-- DONE
-- =========================================
