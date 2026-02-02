import logo from "../assets/logo.png"; // or .svg

export default function Header() {
    return (
        <header className="app-header">
            <div className="logo-container">
                <img src={logo} alt="DayLy logo" className="app-logo" />
                <span className="app-name">DayLy</span>
            </div>
        </header>
    );
}