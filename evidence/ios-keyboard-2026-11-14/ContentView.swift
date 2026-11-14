import SwiftUI
import UIKit

struct ContentView: UIViewControllerRepresentable {
  func makeUIViewController(context: Context) -> KeyboardReproductionController { KeyboardReproductionController() }
  func updateUIViewController(_ uiViewController: KeyboardReproductionController, context: Context) {}
}

final class KeyboardReproductionController: UIViewController {
  private let input = UITextField()
  private let modes = UISegmentedControl(items: ["Accessory", "Native padding", "Neither"])
  private let marker = UIView()
  private let accessory = ReproductionAccessory(frame: CGRect(x: 0, y: 0, width: 0, height: 73))
  private var displayLink: CADisplayLink?
  private var lastTrace = ""

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    let scroll = UIScrollView()
    scroll.keyboardDismissMode = .interactive
    scroll.alwaysBounceVertical = true
    scroll.accessibilityIdentifier = "native.scroll"
    modes.selectedSegmentIndex = 0
    modes.addTarget(self, action: #selector(changeMode), for: .valueChanged)
    input.borderStyle = .roundedRect
    input.placeholder = "Open keyboard"
    input.accessibilityIdentifier = "native.input"
    input.inputAccessoryView = accessory
    marker.backgroundColor = .systemRed
    marker.isUserInteractionEnabled = false
    marker.accessibilityIdentifier = "native.guide"
    for child in [scroll, modes, input, marker] {
      view.addSubview(child)
      child.translatesAutoresizingMaskIntoConstraints = false
    }
    view.keyboardLayoutGuide.usesBottomSafeArea = false
    NSLayoutConstraint.activate([
      modes.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
      modes.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
      modes.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -8),
      input.topAnchor.constraint(equalTo: modes.bottomAnchor, constant: 12),
      input.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
      input.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
      input.heightAnchor.constraint(equalToConstant: 44),
      scroll.topAnchor.constraint(equalTo: input.bottomAnchor, constant: 12),
      scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      marker.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      marker.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      marker.heightAnchor.constraint(equalToConstant: 4),
      marker.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
    ])
    for i in 0..<30 {
      let label = UILabel(frame: CGRect(x: 20, y: i * 64, width: 340, height: 56))
      label.text = "Message \(i + 1). Drag down and hold."
      label.accessibilityIdentifier = "native.message.\(i + 1)"
      scroll.addSubview(label)
    }
    scroll.contentSize = CGSize(width: 360, height: 1920)
    scroll.contentOffset.y = 1000
    let link = CADisplayLink(target: self, selector: #selector(traceFrame))
    link.add(to: .main, forMode: .common)
    displayLink = link
  }

  @objc private func changeMode() {
    input.resignFirstResponder()
    input.inputAccessoryView = modes.selectedSegmentIndex == 0 ? accessory : nil
    view.keyboardLayoutGuide.keyboardDismissPadding = modes.selectedSegmentIndex == 1 ? 73 : 0
  }

  @objc private func traceFrame() {
    let accessoryBottom = accessory.window.map { accessory.convert(accessory.bounds, to: $0).maxY } ?? -1
    let guide = view.keyboardLayoutGuide.layoutFrame.minY
    let trace = String(format: "NATIVE_TRACE mode=%d guide=%.3f accessoryBottom=%.3f", modes.selectedSegmentIndex, guide, accessoryBottom)
    guard trace != lastTrace else { return }
    lastTrace = trace
    NSLog("%@", trace)
  }

  deinit { displayLink?.invalidate() }
}

final class ReproductionAccessory: UIView {
  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = UIColor.systemGreen.withAlphaComponent(0.3)
    isUserInteractionEnabled = false
    autoresizingMask = .flexibleHeight
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  override var intrinsicContentSize: CGSize { CGSize(width: UIView.noIntrinsicMetric, height: frame.height) }
  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool { false }
}
