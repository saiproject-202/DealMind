"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("dm_admin_token");
    router.replace(token ? "/dashboard" : "/login");
  }, [router]);

  return null;
}
