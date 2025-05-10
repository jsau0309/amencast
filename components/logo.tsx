import Link from "next/link"
import Image from "next/image"

export function Logo() {
  return (
    <Link href="/" className="flex items-center">
      <Image
        src="/amencast-logo.svg"
        alt="Amencast Logo"
        width={179}
        height={42}
        style={{
          width: "179px",
          height: "42px",
        }}
        priority
      />
    </Link>
  )
}
