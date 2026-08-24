import SwiftUI

enum AppAppearance: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

enum AppAccentColour: String, CaseIterable, Identifiable {
    case system
    case blue
    case indigo
    case purple
    case pink
    case red
    case orange
    case yellow
    case green
    case mint
    case teal

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: "System"
        case .pink: "Pink (original)"
        default: rawValue.capitalized
        }
    }

    var color: Color? {
        switch self {
        case .system: nil
        case .blue: .blue
        case .indigo: .indigo
        case .purple: .purple
        case .pink: Color(red: 0.949, green: 0.580, blue: 0.918)
        case .red: .red
        case .orange: .orange
        case .yellow: .yellow
        case .green: .green
        case .mint: .mint
        case .teal: .teal
        }
    }
}

struct TrakrMark: View {
    var size: CGFloat = 64

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            ZStack {
                RoundedRectangle(cornerRadius: width * 0.28)
                    .fill(.tint)
                Circle()
                    .fill(.white)
                    .frame(width: width * 0.47, height: width * 0.47)
                    .offset(x: -width * 0.14)
                Circle()
                    .fill(.tint)
                    .frame(width: width * 0.10, height: width * 0.10)
                    .offset(x: -width * 0.14, y: -width * 0.13)
                TrakrSignalWaves(lineWidth: width * 0.075)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

private struct TrakrSignalWaves: View {
    let lineWidth: CGFloat

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let height = proxy.size.height
            ZStack {
                Path { path in
                    path.move(to: CGPoint(x: width * 0.66, y: height * 0.38))
                    path.addCurve(
                        to: CGPoint(x: width * 0.66, y: height * 0.62),
                        control1: CGPoint(x: width * 0.80, y: height * 0.45),
                        control2: CGPoint(x: width * 0.80, y: height * 0.55)
                    )
                }
                .stroke(.white, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                Path { path in
                    path.move(to: CGPoint(x: width * 0.80, y: height * 0.25))
                    path.addCurve(
                        to: CGPoint(x: width * 0.80, y: height * 0.75),
                        control1: CGPoint(x: width * 1.03, y: height * 0.38),
                        control2: CGPoint(x: width * 1.03, y: height * 0.62)
                    )
                }
                .stroke(.white, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
            }
        }
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
            Text(title)
                .font(.headline)
                .frame(maxWidth: .infinity)
                .overlay(alignment: .leading) {
                    Image(systemName: "wave.3.right.circle.fill")
                        .padding(.leading, 18)
                }
                .padding(.vertical, 8)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
    }
}

struct OptionalAccentTint: ViewModifier {
    let color: Color?

    func body(content: Content) -> some View {
        if let color {
            content.tint(color)
        } else {
            content
        }
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
