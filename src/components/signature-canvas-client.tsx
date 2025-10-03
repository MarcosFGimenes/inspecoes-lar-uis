"use client";

import dynamic from "next/dynamic";
import { forwardRef } from "react";
import type { ComponentClass } from "react";
import type SignatureCanvasType from "react-signature-canvas";
import type { SignatureCanvasProps } from "react-signature-canvas";

type SignatureCanvasInstance = SignatureCanvasType;

const SignatureCanvasDynamic = dynamic(() => import("react-signature-canvas"), {
  ssr: false,
}) as unknown as ComponentClass<SignatureCanvasProps>;

const SignatureCanvasWithRef = forwardRef<SignatureCanvasInstance, SignatureCanvasProps>((props, ref) => (
  <SignatureCanvasDynamic {...props} ref={ref} />
));

SignatureCanvasWithRef.displayName = "SignatureCanvas";

export type { SignatureCanvasInstance, SignatureCanvasProps };
export default SignatureCanvasWithRef;
