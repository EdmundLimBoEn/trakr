import SwiftUI

enum TrakrTheme {
    static let ink = Color(red: 0.05, green: 0.09, blue: 0.08)
    static let pink = Color(red: 0.949, green: 0.580, blue: 0.918)
    static let blush = Color(red: 0.988, green: 0.918, blue: 0.984)
    static let paper = Color(red: 0.96, green: 0.96, blue: 0.92)
    static let amber = Color(red: 0.95, green: 0.64, blue: 0.20)
}

struct TrakrMark: View {
    var size: CGFloat = 64

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28)
                .fill(TrakrTheme.pink)
            Image(systemName: "sensor.tag.radiowaves.forward.fill")
                .font(.system(size: size * 0.48, weight: .semibold))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct EmptyState: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        ContentUnavailableView(title, systemImage: icon, description: Text(message))
    }
}

struct StatusPill: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .foregroundStyle(color)
            .background(color.opacity(0.12), in: Capsule())
    }
}

struct ScanButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: "wave.3.right.circle.fill")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
    }
}

extension View {
    func errorAlert(_ error: Binding<Error?>) -> some View {
        alert("Something went wrong", isPresented: Binding(
            get: { error.wrappedValue != nil },
            set: { if !$0 { error.wrappedValue = nil } }
        )) {
            Button("OK") { error.wrappedValue = nil }
        } message: {
            Text(error.wrappedValue?.localizedDescription ?? "Try again.")
        }
    }
}
