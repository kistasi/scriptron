{
  "targets": [
    {
      "target_name": "text_checker",
      "sources": ["text_checker.mm"],
      "xcode_settings": {
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "MACOSX_DEPLOYMENT_TARGET": "11.0",
        "OTHER_CPLUSPLUSFLAGS": ["-std=c++17"]
      },
      "link_settings": {
        "libraries": ["-framework AppKit"]
      }
    }
  ]
}
