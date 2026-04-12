import { NextRequest, NextResponse } from "next/server";
import { hashSignal } from "@worldcoin/idkit-core/hashing";

/**
 * POST /api/debug/verify
 * Debug endpoint to test World ID verification directly via v4 API.
 * DO NOT leave in production.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { verify_payload, prediction_id } = body;

    const appId = process.env.NEXT_PUBLIC_WLD_APP_ID;
    const action = process.env.NEXT_PUBLIC_WLD_ACTION ?? "daily-predict-verify";

    // Log what we received
    const debugInfo: Record<string, unknown> = {
      app_id: appId,
      action,
      prediction_id,
      api_endpoint: `https://developer.world.org/api/v4/verify/${appId}`,
      payload_keys: verify_payload ? Object.keys(verify_payload) : null,
      verification_level: verify_payload?.verification_level,
      has_merkle_root: !!verify_payload?.merkle_root,
      has_nullifier_hash: !!verify_payload?.nullifier_hash,
      has_proof: !!verify_payload?.proof,
    };

    if (!appId) {
      return NextResponse.json({ error: "Missing NEXT_PUBLIC_WLD_APP_ID", debugInfo });
    }

    if (!verify_payload) {
      return NextResponse.json({ error: "Missing verify_payload", debugInfo });
    }

    const signal_hash = hashSignal(prediction_id ?? "");
    const identifier =
      verify_payload.verification_level === "device" ? "device" : "orb";

    const v4Response = await fetch(
      `https://developer.world.org/api/v4/verify/${appId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol_version: "3.0",
          nonce: signal_hash,
          action,
          responses: [
            {
              identifier,
              merkle_root: verify_payload.merkle_root,
              nullifier: verify_payload.nullifier_hash,
              proof: verify_payload.proof,
              signal_hash,
            },
          ],
        }),
      }
    );

    const verifyRes = await v4Response.json();

    return NextResponse.json({
      success: verifyRes.success ?? false,
      verifyRes,
      debugInfo,
      v4_status: v4Response.status,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
    }, { status: 500 });
  }
}
