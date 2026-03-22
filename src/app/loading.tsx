export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#030c18" }}>
      <div className="text-center">
        <div
          className="w-16 h-16 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-6"
        />
        <div
          style={{
            fontFamily: "Teko, sans-serif",
            fontSize: 28,
            color: "#D4AF37",
            letterSpacing: 4,
          }}
        >
          LOADING...
        </div>
      </div>
    </div>
  );
}
