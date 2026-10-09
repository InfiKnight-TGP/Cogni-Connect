import Nav from "@/components/nav";
import { Button } from "@/components/ui/button";
import Image from "next/image";

import Brain from "./brain.jpeg";
import Link from "next/link";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex h-screen w-screen items-start justify-center overflow-hidden pt-32">
        <div className="flex w-full max-w-screen-lg flex-col items-center justify-start px-4">
          <h1 className="py-3 text-center text-5xl font-bold leading-tight">
            AI-Powered Companion For <br />
            <span className="bg-gradient-to-br from-primary to-blue-950 bg-clip-text text-6xl text-transparent">
              Memory Support
            </span>
          </h1>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/dashboard">
              <Button size="lg">Dashboard</Button>
            </Link>
            <Link href="/explore">
              <Button size="lg" variant="secondary">
                Memory Explorer
              </Button>
            </Link>
            <Link href="/upload">
              <Button size="lg" variant="outline">
                Upload Videos
              </Button>
            </Link>
            <Link href="/people">
              <Button size="lg" variant="outline">
                My People
              </Button>
            </Link>
          </div>
          <div className="relative z-0 mt-16 flex aspect-[7/3] w-full">
            <div className="flex aspect-[7/3] w-full items-center overflow-hidden rounded-2xl bg-cover">
              <Image
                src={Brain}
                alt=""
                className="min-w-full max-w-full object-cover"
              />
            </div>
            <div className="absolute -z-10 flex aspect-[7/3] w-full items-center overflow-hidden rounded-2xl bg-cover blur-xl">
              <Image
                src={Brain}
                alt=""
                className="min-w-full max-w-full object-cover"
              />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
