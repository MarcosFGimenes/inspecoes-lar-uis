"use client";

import dynamic from "next/dynamic";
import { forwardRef } from "react";
import type { default as SignatureCanvasType } from "react-signature-canvas";

const SignatureCanvasDynamic = dynamic(() => import("react-signature-canvas"), {
  ssr: false,
}) as unknown as SignatureCanvasType;

export type SignatureCanvasInstance = SignatureCanvasType;
export type SignatureCanvasProps = React.ComponentProps<SignatureCanvasType>;

const SignatureCanvasWithRef = forwardRef<SignatureCanvasInstance, SignatureCanvasProps>((props, ref) => (
  // @ts-expect-error – ref typing is not preserved by next/dynamic
  <SignatureCanvasDynamic {...props} ref={ref} />
));

SignatureCanvasWithRef.displayName = "SignatureCanvasWithRef";

export default SignatureCanvasWithRef;
