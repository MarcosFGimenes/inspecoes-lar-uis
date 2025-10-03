"use client";

import dynamic from "next/dynamic";
import { forwardRef } from "react";
import type { ComponentClass } from "react";
import type SignatureCanvasClass, { SignatureCanvasProps } from "react-signature-canvas";

type SignatureCanvasInstance = SignatureCanvasClass;

const SignatureCanvasDynamic = dynamic(() => import("react-signature-canvas"), {
  ssr: false,
}) as unknown as ComponentClass<SignatureCanvasProps>;

const SignatureCanvasWithRef = forwardRef<SignatureCanvasInstance, SignatureCanvasProps>((props, ref) => (
  // @ts-expect-error – ref typing is not preserved by next/dynamic
  <SignatureCanvasDynamic {...props} ref={ref} />
));

SignatureCanvasWithRef.displayName = "SignatureCanvas";

export type { SignatureCanvasInstance, SignatureCanvasProps };
export default SignatureCanvasWithRef;
