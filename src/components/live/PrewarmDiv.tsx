/**
 * PrewarmDiv — utility wrapper that pre-warms a LiveKit room (DNS + TLS
 * only) when this element enters the viewport. Drop-in replacement for a
 * plain <div> on any tappable tile that navigates into a LiveKit room.
 *
 * Use when you can't restructure the parent into its own component.
 */
import { forwardRef } from "react";
import { useLiveKitPrewarm } from "@/hooks/useLiveKitPrewarm";

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  roomName: string;
}

export const PrewarmDiv = forwardRef<HTMLDivElement, Props>(
  ({ roomName, children, ...rest }, _externalRef) => {
    const ref = useLiveKitPrewarm<HTMLDivElement>(roomName);
    return (
      <div ref={ref} {...rest}>
        {children}
      </div>
    );
  },
);
PrewarmDiv.displayName = "PrewarmDiv";
