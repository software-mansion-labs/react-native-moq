package com.moq.capture

import com.swmansion.moqkit.publish.encoder.AudioCodec
import com.swmansion.moqkit.publish.encoder.VideoCodec

// Single source of truth for the codec <-> JS-string mapping shared by the
// camera / microphone / publisher / screen-broadcast paths.

fun VideoCodec.toJsString(): String = when (this) {
  VideoCodec.H264 -> "h264"
  VideoCodec.H265 -> "h265"
}

fun AudioCodec.toJsString(): String = when (this) {
  AudioCodec.OPUS -> "opus"
  AudioCodec.AAC -> "aac"
}

fun videoCodecFromJs(raw: String, default: VideoCodec): VideoCodec = when (raw) {
  "h264" -> VideoCodec.H264
  "h265" -> VideoCodec.H265
  else -> default
}

fun audioCodecFromJs(raw: String, default: AudioCodec): AudioCodec = when (raw) {
  "opus" -> AudioCodec.OPUS
  "aac" -> AudioCodec.AAC
  else -> default
}
