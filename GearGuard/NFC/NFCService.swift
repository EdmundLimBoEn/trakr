@preconcurrency import CoreNFC
import Foundation

struct ScannedTag {
    let tagID: String
    let hardwareUID: String
}

final class NFCService: NSObject, ObservableObject, NFCTagReaderSessionDelegate, @unchecked Sendable {
    private enum Mode {
        case read
        case write(String)
    }

    private var session: NFCTagReaderSession?
    private var mode: Mode = .read
    private var completion: ((Result<ScannedTag, Error>) -> Void)?

    var isAvailable: Bool {
        NFCTagReaderSession.readingAvailable
    }

    func scan(completion: @escaping (Result<ScannedTag, Error>) -> Void) {
        begin(mode: .read, prompt: "Hold your iPhone near the GearGuard tag.", completion: completion)
    }

    func write(tagID: String, completion: @escaping (Result<ScannedTag, Error>) -> Void) {
        begin(mode: .write(tagID), prompt: "Hold your iPhone near the NFC tag to enroll it.", completion: completion)
    }

    private func begin(mode: Mode, prompt: String, completion: @escaping (Result<ScannedTag, Error>) -> Void) {
        guard isAvailable else {
            completion(.failure(GearGuardError.nfcUnavailable))
            return
        }
        self.mode = mode
        self.completion = completion
        guard let session = NFCTagReaderSession(pollingOption: .iso14443, delegate: self, queue: .main) else {
            completion(.failure(GearGuardError.nfcUnavailable))
            return
        }
        session.alertMessage = prompt
        self.session = session
        session.begin()
    }

    func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}

    func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        guard (error as? NFCReaderError)?.code != .readerSessionInvalidationErrorFirstNDEFTagRead else { return }
        finish(.failure(error))
    }

    func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard tags.count == 1, let tag = tags.first else {
            session.alertMessage = "More than one tag detected. Try again with one tag."
            session.restartPolling()
            return
        }
        session.connect(to: tag) { [weak self] error in
            guard let self else { return }
            if let error {
                session.invalidate(errorMessage: error.localizedDescription)
                self.finish(.failure(error))
                return
            }
            let ndefTag: NFCNDEFTag
            let UID: String
            switch tag {
            case .miFare(let concreteTag):
                ndefTag = concreteTag
                UID = TagCodec.normalizedUID(Array(concreteTag.identifier))
            case .iso7816(let concreteTag):
                ndefTag = concreteTag
                UID = TagCodec.normalizedUID(Array(concreteTag.identifier))
            default:
                session.invalidate(errorMessage: "This tag does not support NDEF.")
                self.finish(.failure(GearGuardError.invalidTagPayload))
                return
            }
            switch self.mode {
            case .read:
                self.read(ndefTag, UID: UID, session: session)
            case .write(let tagID):
                self.write(tagID, to: ndefTag, UID: UID, session: session)
            }
        }
    }

    private func read(_ tag: NFCNDEFTag, UID: String, session: NFCTagReaderSession) {
        tag.readNDEF { [weak self] message, error in
            guard let self else { return }
            guard error == nil,
                  let payload = message?.records.first,
                  let text = Self.text(from: payload),
                  TagCodec.isValid(text) else {
                session.invalidate(errorMessage: GearGuardError.invalidTagPayload.localizedDescription)
                self.finish(.failure(GearGuardError.invalidTagPayload))
                return
            }
            session.alertMessage = "Equipment tag scanned."
            session.invalidate()
            self.finish(.success(ScannedTag(tagID: text, hardwareUID: UID)))
        }
    }

    private func write(_ tagID: String, to tag: NFCNDEFTag, UID: String, session: NFCTagReaderSession) {
        guard let payload = NFCNDEFPayload.wellKnownTypeTextPayload(string: tagID, locale: Locale(identifier: "en")) else {
            finish(.failure(GearGuardError.invalidTagPayload))
            return
        }
        let message = NFCNDEFMessage(records: [payload])
        tag.queryNDEFStatus { [weak self] status, capacity, error in
            guard let self else { return }
            guard error == nil, status == .readWrite else {
                session.invalidate(errorMessage: GearGuardError.tagNotWritable.localizedDescription)
                self.finish(.failure(GearGuardError.tagNotWritable))
                return
            }
            guard capacity >= message.length else {
                session.invalidate(errorMessage: GearGuardError.tagTooSmall.localizedDescription)
                self.finish(.failure(GearGuardError.tagTooSmall))
                return
            }
            tag.writeNDEF(message) { error in
                guard error == nil else {
                    session.invalidate(errorMessage: error!.localizedDescription)
                    self.finish(.failure(error!))
                    return
                }
                tag.readNDEF { verification, error in
                    guard error == nil,
                          let record = verification?.records.first,
                          Self.text(from: record) == tagID else {
                        session.invalidate(errorMessage: GearGuardError.verificationFailed.localizedDescription)
                        self.finish(.failure(GearGuardError.verificationFailed))
                        return
                    }
                    session.alertMessage = "Tag written and verified."
                    session.invalidate()
                    self.finish(.success(ScannedTag(tagID: tagID, hardwareUID: UID)))
                }
            }
        }
    }

    private func finish(_ result: Result<ScannedTag, Error>) {
        guard let completion else { return }
        self.completion = nil
        completion(result)
    }

    private static func text(from payload: NFCNDEFPayload) -> String? {
        guard payload.typeNameFormat == .nfcWellKnown,
              String(data: payload.type, encoding: .utf8) == "T",
              let status = payload.payload.first else { return nil }
        let languageLength = Int(status & 0x3F)
        guard payload.payload.count > languageLength + 1 else { return nil }
        return String(data: payload.payload.dropFirst(languageLength + 1), encoding: .utf8)
    }
}
