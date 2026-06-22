import { useRef, useImperativeHandle, forwardRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string;
};

export const SignaturePad = forwardRef<SignaturePadHandle, { height?: number }>(
  ({ height = 160 }, ref) => {
    const sigRef = useRef<SignatureCanvas>(null);

    useImperativeHandle(ref, () => ({
      clear: () => sigRef.current?.clear(),
      isEmpty: () => sigRef.current?.isEmpty() ?? true,
      toDataURL: () => sigRef.current?.toDataURL("image/png") ?? "",
    }));

    return (
      <div className="space-y-2">
        <div className="border-2 border-dashed rounded-md bg-white">
          <SignatureCanvas
            ref={sigRef}
            penColor="#0a0a23"
            canvasProps={{
              className: "w-full",
              style: { width: "100%", height },
            }}
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => sigRef.current?.clear()}>
            Clear signature
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Sign with mouse or finger
          </span>
        </div>
      </div>
    );
  }
);
SignaturePad.displayName = "SignaturePad";
