import { render } from "preact";
import { App } from "./App.jsx";
import "./styles/app.css";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

render(<App />, document.getElementById("app"));
