import type { ReactNode } from "react";
import BookingsNav from "./BookingsNav";

export default function BookingsLayout({ children }: { children: ReactNode }) {
  return (
    <main>
      <BookingsNav />
      {children}
    </main>
  );
}
