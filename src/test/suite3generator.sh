
echo "" >x.txt

echo -n "[['--help'], \`" >>x.txt; ./suite3 "[.],*" --verbosity high --help >>x.txt; echo "\`]," >>x.txt;
echo -n "[['[.],*', '--verbosity', 'high', '--list-tests', '--use-colour', 'no'], \`" >>x.txt ./suite3 "[.],*" --verbosity high --list-tests --use-colour no >>x.txt; echo "\`]," >>x.txt ;

echo -n "[['--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;

echo -n "[['test name\,with\,colon', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "test name\,with\,colon" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['*test name with space ', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "*test name with space " --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['SECTION tree', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "SECTION tree" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec ! char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec ! char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec @ char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec @ char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec # char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec # char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec $ char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec $ char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec % char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec % char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec ^ char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec ^ char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec & char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec & char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec * char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec * char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec \(a\) char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec (a) char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec {a} char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec {a} char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec \[a] char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec \[a] char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec ; char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec ; char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec \\' char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec ' char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec \\\\ char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec \\\ char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec \, char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec \, char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec . char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec . char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec / char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec / char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec < char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec < char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec > char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec > char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec ? char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec ? char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec - char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec - char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec = char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec = char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec _ char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec _ char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec + char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec + char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec ~ char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec ~ char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec \\\` char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec \` char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec § char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec § char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec ± char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec ± char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec \" char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec \" char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec | char', '--reporter', 'xml', '--durations', 'yes'], \`" >>x.txt; ./suite3 "spec | char" --reporter xml --durations yes >>x.txt; echo "\`]," >>x.txt ;

echo -n "[['test name\,with\,colon', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "test name\,with\,colon" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['*test name with space ', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "*test name with space " --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['SECTION tree', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "SECTION tree" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec ! char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec ! char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec @ char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec @ char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec # char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec # char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec $ char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec $ char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec % char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec % char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec ^ char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec ^ char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec & char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec & char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec * char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec * char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec \(a\) char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec (a) char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec {a} char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec {a} char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec \[a] char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec \[a] char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec ; char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec ; char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec \\' char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec ' char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec \\\\ char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec \\\ char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec \, char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec \, char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec . char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec . char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec / char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec / char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec < char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec < char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec > char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec > char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec ? char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec ? char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec - char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec - char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec = char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec = char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec _ char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec _ char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec + char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec + char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec ~ char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec ~ char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec \\\` char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec \` char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec § char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec § char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec ± char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec ± char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec \" char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec \" char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;
echo -n "[['spec | char', '--reporter', 'xml', '--durations', 'yes', '--rng-seed', '2'], \`" >>x.txt; ./suite3 "spec | char" --reporter xml --durations yes --rng-seed 2 >>x.txt; echo "\`]," >>x.txt ;

