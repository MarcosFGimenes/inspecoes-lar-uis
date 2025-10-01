"use client";

import { forwardRef } from "react";
import SignatureCanvas from "react-signature-canvas";

export type SignatureCanvasInstance = SignatureCanvas;
export type SignatureCanvasProps = React.ComponentProps<typeof SignatureCanvas>;

const SignatureCanvasWithRef = forwardRef<SignatureCanvasInstance, SignatureCanvasProps>((props, ref) => (
  <SignatureCanvas {...props} ref={ref} />
));

SignatureCanvasWithRef.displayName = "SignatureCanvasWithRef";

export default SignatureCanvasWithRef;
