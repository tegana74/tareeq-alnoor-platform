// Live Classroom — Stub services (Phase 1)
// عقود موثّقة فقط: التنفيذ الفعلي يأتي في مرحلة محرك البث (LiveKit/WebRTC).
// أي استدعاء هنا يفشل بوضوح بدل أن يتظاهر بالعمل.

export const NOT_IMPLEMENTED = "LIVE_CLASSROOM_PHASE_2_NOT_IMPLEMENTED" as const

function stub(name: string): never {
  throw new Error(`${NOT_IMPLEMENTED}: ${name}`)
}

/** إشارة/صوت/فيديو — LiveKit لاحقًا */
export interface BroadcastService {
  startBroadcast(sessionId: string): Promise<never>
  stopBroadcast(sessionId: string): Promise<never>
  joinAsParticipant(sessionId: string, userId: string): Promise<never>
}

export const broadcastService: BroadcastService = {
  async startBroadcast() { return stub("BroadcastService.startBroadcast") },
  async stopBroadcast() { return stub("BroadcastService.stopBroadcast") },
  async joinAsParticipant() { return stub("BroadcastService.joinAsParticipant") },
}

/** الحضور المباشر أثناء الجلسة (نبضات/مدد) — منفصل عن LiveSessionAttendance المخزّن */
export interface RealtimeAttendanceService {
  heartbeat(sessionId: string, userId: string): Promise<never>
}

export const realtimeAttendanceService: RealtimeAttendanceService = {
  async heartbeat() { return stub("RealtimeAttendanceService.heartbeat") },
}

/** التسجيل — لن يُنفَّذ في هذه المرحلة */
export interface RecordingService {
  startRecording(sessionId: string): Promise<never>
  finalizeRecording(sessionId: string, storagePath: string): Promise<never>
}

export const recordingService: RecordingService = {
  async startRecording() { return stub("RecordingService.startRecording") },
  async finalizeRecording() { return stub("RecordingService.finalizeRecording") },
}

/** السبورة (tldraw لاحقًا) + عرض PDF داخلها */
export interface WhiteboardService {
  createBoard(sessionId: string): Promise<never>
  attachPdf(boardId: string, fileKey: string): Promise<never>
}

export const whiteboardService: WhiteboardService = {
  async createBoard() { return stub("WhiteboardService.createBoard") },
  async attachPdf() { return stub("WhiteboardService.attachPdf") },
}
