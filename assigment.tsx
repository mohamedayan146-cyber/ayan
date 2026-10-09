

export default function Visted page() {
  return (
    <div>
      <h1>Notifications</h1>
      <p>You have no new visiter.</p>
    </div>
  );
}



interface UserPageProps {
  params: {
    username: string;
  };
}

export default function UserPage({ params }: UserPageProps) {
  const { username } = params;

  return (
    <div>
      <h1>welcome, {username}</h1>
    </div>
  );
}


interface BlogPageProps {
  params: {
    slug?: string[];
  };
}

export default function BlogPage({ params }: BlogPageProps) {
  const slug = params.slug?.join("/") ?? "";

  return (
    <div>
      <p>You viist: /{slug}</p>
    </div>
  );
}



import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { username: string } }
) {
  const { username } = params;

  return NextResponse.json({ username });
}