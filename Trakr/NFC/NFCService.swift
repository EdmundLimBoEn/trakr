@preconcurrency import CoreNFC
import Foundation

struct ScannedTag {
    let tagID: String
    let hardwareUID: String
}

enum NFCWriteConfirmation: Equatable {
    case verified
    case writeConfirmed

    static func resolve(expectedTagID: String, message: NFCNDEFMessage?, error: Error?) -> Self {
        guard error == nil,
              let record = message?.records.first,
              NFCService.text(from: record) == expectedTagID else {
            return .writeConfirmed
        }
        return .verified
    }
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
        begin(mode: .read, prompt: "Hold your iPhone near the Trakr tag.", completion: completion)
    }

    func write(tagID: String, completion: @escaping (Result<ScannedTag, Error>) -> Void) {
        begin(mode: .write(tagID), prompt: "Hold your iPhone near the NFC tag to enroll it.", completion: completion)
    }

    private func begin(mode: Mode, prompt: String, completion: @escaping (Result<ScannedTag, Error>) -> Void) {
        guard isAvailable else {
            completion(.failure(TrakrError.nfcUnavailable))
            return
        }
        self.mode = mode
        self.completion = completion
        guard let session = NFCTagReaderSession(pollingOption: .iso14443, delegate: self, queue: .main) else {
            completion(.failure(TrakrError.nfcUnavailable))
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
                self.finish(.failure(TrakrError.invalidTagPayload))
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
                session.invalidate(errorMessage: TrakrError.invalidTagPayload.localizedDescription)
                self.finish(.failure(TrakrError.invalidTagPayload))
                return
            }
            session.alertMessage = "Equipment tag scanned."
            session.invalidate()
            self.finish(.success(ScannedTag(tagID: text, hardwareUID: UID)))
        }
    }

    private func write(_ tagID: String, to tag: NFCNDEFTag, UID: String, session: NFCTagReaderSession) {
        guard let payload = NFCNDEFPayload.wellKnownTypeTextPayload(string: tagID, locale: Locale(identifier: "en")) else {
            finish(.failure(TrakrError.invalidTagPayload))
            return
        }
        let message = NFCNDEFMessage(records: [payload])
        tag.queryNDEFStatus { [weak self] status, capacity, error in
            guard let self else { return }
            guard error == nil, status == .readWrite else {
                session.invalidate(errorMessage: TrakrError.tagNotWritable.localizedDescription)
                self.finish(.failure(TrakrError.tagNotWritable))
                return
            }
            guard capacity >= message.length else {
                session.invalidate(errorMessage: TrakrError.tagTooSmall.localizedDescription)
                self.finish(.failure(TrakrError.tagTooSmall))
                return
            }
            tag.writeNDEF(message) { error in
                guard error == nil else {
                    session.invalidate(errorMessage: error!.localizedDescription)
                    self.finish(.failure(error!))
                    return
                }
                tag.readNDEF { verification, verificationError in
                    let confirmation = NFCWriteConfirmation.resolve(
                        expectedTagID: tagID,
                        message: verification,
                        error: verificationError
                    )
                    session.alertMessage = confirmation == .verified
                        ? "Tag written and verified."
                        : "Tag written successfully."
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

    static func text(from payload: NFCNDEFPayload) -> String? {
        payload.wellKnownTypeTextPayload().0
    }
}
