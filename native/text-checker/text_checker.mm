// Node-API bindings for the macOS spelling and grammar checker (NSSpellChecker).

#import <AppKit/AppKit.h>
#include <node_api.h>

#include <string>
#include <vector>

namespace {

struct Issue {
  bool grammar;
  NSUInteger from;
  NSUInteger to;
  std::u16string message;
  std::vector<std::u16string> corrections;
};

struct CheckWork {
  std::vector<std::u16string> texts;
  NSTextCheckingTypes types;
  std::vector<std::vector<Issue>> results;
  napi_async_work work;
  napi_deferred deferred;
};

// Shared by all checks, so the checker treats them as one document.
NSInteger documentTag() {
  static NSInteger tag = [NSSpellChecker uniqueSpellDocumentTag];
  return tag;
}

std::u16string toU16(NSString *string) {
  std::u16string result(string.length, u'\0');
  [string getCharacters:reinterpret_cast<unichar *>(result.data())
                  range:NSMakeRange(0, string.length)];
  return result;
}

NSString *toNSString(const std::u16string &text) {
  return [NSString stringWithCharacters:reinterpret_cast<const unichar *>(text.data())
                                 length:text.size()];
}

std::vector<Issue> issuesFrom(NSArray<NSTextCheckingResult *> *results) {
  std::vector<Issue> issues;
  for (NSTextCheckingResult *result in results) {
    if (result.resultType == NSTextCheckingTypeSpelling) {
      issues.push_back({false, result.range.location, NSMaxRange(result.range), u"", {}});
      continue;
    }
    if (result.resultType != NSTextCheckingTypeGrammar) continue;
    // A grammar result covers a sentence; each detail is one issue within it.
    for (NSDictionary *detail in result.grammarDetails) {
      NSValue *rangeValue = detail[NSGrammarRange];
      if (!rangeValue) continue;
      NSRange range = rangeValue.rangeValue;
      Issue issue{true, result.range.location + range.location,
                  result.range.location + NSMaxRange(range), u"", {}};
      NSString *description = detail[NSGrammarUserDescription];
      if ([description isKindOfClass:[NSString class]]) issue.message = toU16(description);
      NSArray *corrections = detail[NSGrammarCorrections];
      if ([corrections isKindOfClass:[NSArray class]]) {
        for (id correction in corrections) {
          if ([correction isKindOfClass:[NSString class]]) {
            issue.corrections.push_back(toU16(correction));
          }
        }
      }
      issues.push_back(std::move(issue));
    }
  }
  return issues;
}

// Runs on a worker thread. requestCheckingOfString is the checker's asynchronous API, safe to
// use off the main thread; its completion handlers run on arbitrary threads.
void executeCheck(napi_env, void *data) {
  auto *work = static_cast<CheckWork *>(data);
  @autoreleasepool {
    NSSpellChecker *checker = [NSSpellChecker sharedSpellChecker];
    work->results.resize(work->texts.size());
    dispatch_group_t group = dispatch_group_create();
    for (size_t i = 0; i < work->texts.size(); i++) {
      NSString *text = toNSString(work->texts[i]);
      if (text.length == 0) continue;
      dispatch_group_enter(group);
      [checker requestCheckingOfString:text
                                 range:NSMakeRange(0, text.length)
                                 types:work->types
                               options:nil
                inSpellDocumentWithTag:documentTag()
                     completionHandler:^(NSInteger, NSArray<NSTextCheckingResult *> *results,
                                         NSOrthography *, NSInteger) {
                       work->results[i] = issuesFrom(results);
                       dispatch_group_leave(group);
                     }];
    }
    dispatch_group_wait(group, DISPATCH_TIME_FOREVER);
  }
}

napi_value string16(napi_env env, const std::u16string &text) {
  napi_value value;
  napi_create_string_utf16(env, text.data(), text.size(), &value);
  return value;
}

napi_value number(napi_env env, double n) {
  napi_value value;
  napi_create_double(env, n, &value);
  return value;
}

napi_value issueObject(napi_env env, const Issue &issue) {
  napi_value object, kind;
  napi_create_object(env, &object);
  napi_create_string_utf8(env, issue.grammar ? "grammar" : "spelling", NAPI_AUTO_LENGTH, &kind);
  napi_set_named_property(env, object, "kind", kind);
  napi_set_named_property(env, object, "from", number(env, issue.from));
  napi_set_named_property(env, object, "to", number(env, issue.to));
  if (issue.grammar) {
    napi_set_named_property(env, object, "message", string16(env, issue.message));
    napi_value corrections;
    napi_create_array_with_length(env, issue.corrections.size(), &corrections);
    for (size_t i = 0; i < issue.corrections.size(); i++) {
      napi_set_element(env, corrections, i, string16(env, issue.corrections[i]));
    }
    napi_set_named_property(env, object, "corrections", corrections);
  }
  return object;
}

void completeCheck(napi_env env, napi_status, void *data) {
  auto *work = static_cast<CheckWork *>(data);
  napi_value results;
  napi_create_array_with_length(env, work->results.size(), &results);
  for (size_t i = 0; i < work->results.size(); i++) {
    napi_value issues;
    napi_create_array_with_length(env, work->results[i].size(), &issues);
    for (size_t j = 0; j < work->results[i].size(); j++) {
      napi_set_element(env, issues, j, issueObject(env, work->results[i][j]));
    }
    napi_set_element(env, results, i, issues);
  }
  napi_resolve_deferred(env, work->deferred, results);
  napi_delete_async_work(env, work->work);
  delete work;
}

bool readString(napi_env env, napi_value value, std::u16string &out) {
  size_t length;
  if (napi_get_value_string_utf16(env, value, nullptr, 0, &length) != napi_ok) return false;
  out.resize(length);
  return napi_get_value_string_utf16(env, value, out.data(), length + 1, &length) == napi_ok;
}

bool readFlag(napi_env env, napi_value object, const char *name) {
  napi_value value;
  bool flag = false;
  if (napi_get_named_property(env, object, name, &value) == napi_ok) {
    napi_get_value_bool(env, value, &flag);
  }
  return flag;
}

// check(texts: string[], { spelling, grammar }): Promise<TextIssue[][]>
napi_value Check(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  bool isArray = false;
  if (argc < 2 || napi_is_array(env, argv[0], &isArray) != napi_ok || !isArray) {
    napi_throw_type_error(env, nullptr, "check(texts, options) expects an array of strings");
    return nullptr;
  }

  auto *work = new CheckWork();
  uint32_t length;
  napi_get_array_length(env, argv[0], &length);
  work->texts.resize(length);
  for (uint32_t i = 0; i < length; i++) {
    napi_value element;
    napi_get_element(env, argv[0], i, &element);
    if (!readString(env, element, work->texts[i])) {
      delete work;
      napi_throw_type_error(env, nullptr, "check(texts, options) expects an array of strings");
      return nullptr;
    }
  }
  work->types = (readFlag(env, argv[1], "spelling") ? NSTextCheckingTypeSpelling : 0) |
                (readFlag(env, argv[1], "grammar") ? NSTextCheckingTypeGrammar : 0);

  napi_value promise, name;
  napi_create_promise(env, &work->deferred, &promise);
  napi_create_string_utf8(env, "text-checker", NAPI_AUTO_LENGTH, &name);
  napi_create_async_work(env, nullptr, name, executeCheck, completeCheck, work, &work->work);
  napi_queue_async_work(env, work->work);
  return promise;
}

// guesses(word: string): string[]
napi_value Guesses(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  std::u16string word;
  if (argc < 1 || !readString(env, argv[0], word)) {
    napi_throw_type_error(env, nullptr, "guesses(word) expects a string");
    return nullptr;
  }

  napi_value result;
  @autoreleasepool {
    NSString *text = toNSString(word);
    NSArray<NSString *> *guesses =
        [[NSSpellChecker sharedSpellChecker] guessesForWordRange:NSMakeRange(0, text.length)
                                                        inString:text
                                                        language:nil
                                          inSpellDocumentWithTag:documentTag()];
    napi_create_array_with_length(env, guesses.count, &result);
    for (NSUInteger i = 0; i < guesses.count; i++) {
      napi_set_element(env, result, i, string16(env, toU16(guesses[i])));
    }
  }
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"check", nullptr, Check, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"guesses", nullptr, Guesses, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 2, properties);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
