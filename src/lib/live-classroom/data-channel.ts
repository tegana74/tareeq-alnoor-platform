import {
  ParticipantInfo_State,
  RoomServiceClient,
  ServerError,
} from "livekit-server-sdk"

export async function broadcastData(
  roomName: string,
  data: Uint8Array,
  options?: { destinationIdentities?: string[] }
) {
  const service = new RoomServiceClient(
    process.env.NEXT_PUBLIC_LIVEKIT_URL!,
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!
  )
  await service.sendData(roomName, data, 1, options?.destinationIdentities) // 1 = RELIABLE
}
