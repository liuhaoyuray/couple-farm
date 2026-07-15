import { PropsWithChildren } from "react";
import Taro, { useLaunch } from "@tarojs/taro";
import "./app.scss";

const CLOUDBASE_ENV_ID = "couple-farm-d8gtiahu251a27c23";

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    Taro.cloud.init({
      env: CLOUDBASE_ENV_ID,
      traceUser: true,
    });
  });

  return children;
}

export default App;
