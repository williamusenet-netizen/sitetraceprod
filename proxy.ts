import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

const BOSS_AUTH_REALM = "FieldTrace Boss";

function unauthorizedResponse() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": `Basic realm="${BOSS_AUTH_REALM}", charset="UTF-8"`,
    },
  });
}

function unavailableResponse() {
  return new NextResponse("Boss access is not configured.", {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseBasicCredentials(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Basic ")) {
    return null;
  }

  const encodedCredentials = authorizationHeader.slice("Basic ".length).trim();
  const decodedCredentials = Buffer.from(encodedCredentials, "base64").toString("utf8");
  const separatorIndex = decodedCredentials.indexOf(":");

  if (separatorIndex < 0) {
    return null;
  }

  return {
    password: decodedCredentials.slice(separatorIndex + 1),
    user: decodedCredentials.slice(0, separatorIndex),
  };
}

export function proxy(request: NextRequest) {
  const expectedUser = process.env.FIELDTRACE_BOSS_USER?.trim() || "fieldtrace";
  const expectedPassword = process.env.FIELDTRACE_BOSS_PASSWORD?.trim();

  if (!expectedPassword) {
    return unavailableResponse();
  }

  const credentials = parseBasicCredentials(request.headers.get("authorization"));

  if (!credentials) {
    return unauthorizedResponse();
  }

  const userMatches = safeCompare(credentials.user, expectedUser);
  const passwordMatches = safeCompare(credentials.password, expectedPassword);

  if (!userMatches || !passwordMatches) {
    return unauthorizedResponse();
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: "/boss/:path*",
};
