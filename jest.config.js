module.exports = {
	testEnvironment: "node",
	transform: {
		"^.+\\.js$": "babel-jest"
	},
	transformIgnorePatterns: [
		"node_modules/(?!(react-native|@react-native|react-native-tcp-socket)/)"
	],
	moduleNameMapper: {
		"^react-native$": "react-native"
	},
	setupFilesAfterEnv: [],
	testMatch: ["**/__tests__/**/*.js", "!**/example/**"]
};
