package systems.edmundlim.trakr

import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable
import systems.edmundlim.trakr.domain.TagCodec
import java.nio.charset.StandardCharsets
import java.util.Locale

data class ScannedNfcTag(val payload: String?, val hardwareUid: String)

object NfcTagReader {
    fun read(tag: Tag): ScannedNfcTag {
        val hardwareUid = TagCodec.normalizeUid(tag.id)
        val ndef = Ndef.get(tag) ?: return ScannedNfcTag(null, hardwareUid)
        return runCatching {
            ndef.connect()
            val payload = ndef.ndefMessage?.records?.firstNotNullOfOrNull(::readTextRecord)
            ScannedNfcTag(payload, hardwareUid)
        }.getOrElse { ScannedNfcTag(null, hardwareUid) }.also {
            runCatching { ndef.close() }
        }
    }

    fun write(tag: Tag, payload: String) {
        require(TagCodec.isValid(payload)) { "The generated Trakr tag payload is invalid." }
        val language = Locale.ENGLISH.language.toByteArray(StandardCharsets.US_ASCII)
        val text = payload.toByteArray(StandardCharsets.UTF_8)
        val recordPayload = byteArrayOf(language.size.toByte()) + language + text
        val message = NdefMessage(
            arrayOf(
                NdefRecord(
                    NdefRecord.TNF_WELL_KNOWN,
                    NdefRecord.RTD_TEXT,
                    ByteArray(0),
                    recordPayload,
                ),
            ),
        )
        val ndef = Ndef.get(tag)
        if (ndef != null) {
            ndef.connect()
            try {
                check(ndef.isWritable) { "This NFC tag is read-only." }
                check(ndef.maxSize >= message.toByteArray().size) { "This NFC tag does not have enough space." }
                ndef.writeNdefMessage(message)
            } finally {
                ndef.close()
            }
            return
        }
        val formatable = NdefFormatable.get(tag) ?: error("This NFC tag cannot store NDEF data.")
        formatable.connect()
        try {
            formatable.format(message)
        } finally {
            formatable.close()
        }
    }

    private fun readTextRecord(record: NdefRecord): String? {
        if (record.tnf != NdefRecord.TNF_WELL_KNOWN || !record.type.contentEquals(NdefRecord.RTD_TEXT)) return null
        val payload = record.payload
        if (payload.isEmpty()) return null
        val languageLength = payload[0].toInt() and 0x3F
        if (payload.size <= languageLength + 1) return null
        val isUtf16 = payload[0].toInt() and 0x80 != 0
        val charset = if (isUtf16) StandardCharsets.UTF_16 else StandardCharsets.UTF_8
        return String(payload, languageLength + 1, payload.size - languageLength - 1, charset)
    }
}
