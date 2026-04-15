"use client";
import { HomePageV1 } from "./home/v1";
import { HomePageV2 } from "./home/v2";

const HomePage = () => {
  const buildName = process.env.NEXT_PUBLIC_BUILD_NAME;
  console.log('buildName', buildName);
  if (buildName === 'nuvoras') {
    return <HomePageV1 />;
  } else {
    return <HomePageV2 />;
  }
};

export default HomePage;
