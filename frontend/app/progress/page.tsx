"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProgressPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/caregiver?tab=progress"); }, [router]);
  return null;
}
